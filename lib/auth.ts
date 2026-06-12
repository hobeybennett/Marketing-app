import { NextAuthOptions, getServerSession as _getServerSession } from 'next-auth';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import crypto from 'crypto';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: 'email-otp',
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) return null;

        const email = credentials.email.toLowerCase().trim();
        const codeHash = crypto.createHash('sha256').update(credentials.code.trim()).digest('hex');

        const otp = await prisma.otpToken.findFirst({
          where: { email, codeHash, expiresAt: { gt: new Date() } },
        });
        if (!otp) return null;

        // Consume the token immediately
        await prisma.otpToken.delete({ where: { id: otp.id } });

        // Find or create the user
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, emailVerified: new Date() },
          });
        } else if (!user.emailVerified) {
          await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
        }

        return { id: user.id, email: user.email ?? '', name: user.name, image: user.image };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
};

export function getServerSession() {
  return _getServerSession(authOptions);
}
