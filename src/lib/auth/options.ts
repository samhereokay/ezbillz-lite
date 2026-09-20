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
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        // Constant-shape response whether the user exists or not, to avoid
        // user-enumeration via response timing/content differences.
        if (!user) {
          await argon2.hash("dummy-to-equalize-timing");
          // Auth failure - user not found
          return null;
        }

        const valid = await argon2.verify(user.passwordHash, credentials.password);
        if (!valid) {
          // Auth failure - invalid password
          return null;
        }

        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
        token.sessionVersion = (user as any).sessionVersion;
      }
      
      if (token.userId) {
        // Look up current sessionVersion in the DB to support global logout and session invalidation
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { sessionVersion: true },
        });
        
        if (!dbUser || dbUser.sessionVersion !== token.sessionVersion) {
          // Returning an empty object or null here effectively invalidates the token payload,
          // which forces the session callback to fail and rejects authentication.
          return {};
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      if (!token || !token.userId) {
        // Force the session to be empty / unauthenticated
        return {} as any;
      }
      if (session.user) {
        (session.user as { id: string }).id = token.userId as string;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token && token.userId) {
        await prisma.user.update({
          where: { id: token.userId as string },
          data: { sessionVersion: { increment: 1 } },
        });
      }
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function hashPassword(plain: string): Promise<string> {
  // Argon2id per spec — memory-hard, resistant to GPU cracking.
  return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
