import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /** When Gmail OAuth is connected, use that address for profile/JWT; login still uses `users.email`. */
  private effectiveEmail(user: { email: string; gmailToken?: { email: string | null } | null }): string {
    const g = user.gmailToken?.email?.trim();
    return g || user.email;
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash: hash, name: dto.name },
    });

    return this.signToken(user.id, user.email, user.name);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { gmailToken: { select: { email: true } } },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user.id, this.effectiveEmail(user), user.name);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        gmailToken: { select: { email: true } },
      },
    });
    if (!user) return null;
    const displayEmail = this.effectiveEmail(user);
    const loginEmail = user.email;
    return {
      id: user.id,
      email: displayEmail,
      /** Address used for email+password sign-in (may differ from `email` when Gmail OAuth is linked). */
      loginEmail,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  private signToken(userId: string, email: string, name?: string | null) {
    const payload = { sub: userId, email, name };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: userId, email, name },
    };
  }
}
