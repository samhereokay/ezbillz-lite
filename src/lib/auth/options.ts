import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import * as argon2 from "argon2";
import { prisma } from "../db/client";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 }, // Exactly 24 hours
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("Authorize called with email:", credentials?.email);
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        console.log("User found:", user ? "YES" : "NO", user?.email);
        // Constant-shape response whether the user exists or not, to avoid
        // user-enumeration via response timing/content differences.
        if (!user) {
          await argon2.hash("dummy-to-equalize-timing");
          return null;
        }

        const valid = await argon2.verify(user.passwordHash, credentials.password);
        console.log("Password valid:", valid);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = (user as { id: string }).id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.userId as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function hashPassword(plain: string): Promise<string> {
  // Argon2id per spec — memory-hard, resistant to GPU cracking.
  return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
