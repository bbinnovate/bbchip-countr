import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, hashPassword } from "@/lib/auth-server";
import { adminDb, type AdminRole } from "@/lib/firebase-admin";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.enum(["admin", "superadmin"]).optional().default("admin"),
  secret: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting by IP (max 5 attempts in prod, 50 in dev)
    const ip =
      req.headers.get("x-client-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    const maxAttempts = process.env.NODE_ENV === "production" ? 5 : 50;
    const rateCheck = checkRateLimit(`register_${ip}`, maxAttempts, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 },
      );
    }

    // 2. Secret verification (Postman / server-to-server bootstrap only)
    const serverSecret = process.env.ADMIN_REGISTRATION_SECRET;
    if (!serverSecret) {
      return NextResponse.json(
        { error: "Server registration is disabled or unconfigured" },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const secretFromHeader = req.headers.get("x-admin-secret");
    const secretFromBody = typeof body.secret === "string" ? body.secret : null;
    const providedSecret = secretFromHeader || secretFromBody;

    if (!providedSecret) {
      return NextResponse.json(
        { error: "Admin registration secret is required (via 'x-admin-secret' header or body)" },
        { status: 401 },
      );
    }

    if (providedSecret !== serverSecret) {
      return NextResponse.json(
        { error: "Forbidden: Invalid admin registration secret" },
        { status: 403 },
      );
    }

    // 3. Input validation
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" },
        { status: 400 },
      );
    }

    const { email, password, name, role } = parsed.data;

    // 4. Check for duplicate admin email
    const existing = await adminDb.getAdminUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An admin user with this email address already exists" },
        { status: 409 },
      );
    }

    // 5. Hash password
    const passwordHash = await hashPassword(password);

    // 6. Create admin user
    const newUser = await adminDb.createAdminUser({
      email,
      name,
      passwordHash,
      role: role as AdminRole,
    });

    // 7. Safe response (strictly exclude passwordHash)
    return NextResponse.json(
      {
        success: true,
        message: "Admin user registered successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          createdAt: newUser.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("[Admin Register Error]:", err);
    return NextResponse.json(
      { error: "Internal server error occurred during registration" },
      { status: 500 },
    );
  }
}
