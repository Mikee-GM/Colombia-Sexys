import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { ACCESS_COOKIE } from '../auth.constants';

const cookieExtractor = (request: { signedCookies?: Record<string, string> }) =>
  request?.signedCookies?.[ACCESS_COOKIE] ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ||
        'super_secret_key_change_me_in_production_123456',
    });
  }

  async validate(payload: { sub: string; email: string; type?: string }) {
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Tipo de token inválido');
    }
    const user = await this.usuariosRepository.findOne({
      where: { id: payload.sub, activo: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no válido o inactivo');
    }
    return user;
  }
}
