import { UnauthorizedException } from '@nestjs/common';
import { PanelAccessService } from './panel-access.service';

/**
 * El pase abre sesion sin contrasena, asi que lo que importa no es que
 * funcione, sino que no funcione dos veces, ni fuera de plazo, ni en otro chat.
 */
describe('PanelAccessService', () => {
  const tokens = {
    save: jest.fn(),
    create: jest.fn((v) => v),
    query: jest.fn(),
  };
  const usuarios = { findOne: jest.fn() };
  const configService = { get: jest.fn(() => 'https://panel.example.com') };

  const service = new PanelAccessService(
    tokens as any,
    usuarios as any,
    configService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    usuarios.findOne.mockResolvedValue({ id: 'jefe-1', activo: true });
  });

  describe('issueLink', () => {
    it('guarda solo la huella y devuelve el enlace una vez', async () => {
      const { url } = await service.issueLink(
        'jefe-1',
        '555',
        '/admin/services/abc',
      );

      const guardado = tokens.save.mock.calls[0][0];
      expect(guardado.tokenHash).toHaveLength(64);
      expect(url).toContain('https://panel.example.com/acceso/');
      // El pase en claro nunca se guarda: no debe aparecer en la fila.
      const enClaro = url.split('/acceso/')[1];
      expect(guardado.tokenHash).not.toBe(enClaro);
      expect(guardado.redirectPath).toBe('/admin/services/abc');
    });

    it('descarta un destino que apunte fuera del panel', async () => {
      await service.issueLink('jefe-1', '555', 'https://sitio-ajeno.com/roba');

      expect(tokens.save.mock.calls[0][0].redirectPath).toBeNull();
    });

    it('no emite pases para un usuario inactivo', async () => {
      usuarios.findOne.mockResolvedValue({ id: 'jefe-1', activo: false });

      await expect(service.issueLink('jefe-1', '555')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('consume', () => {
    it('canjea un pase vigente y devuelve a donde llevar al jefe', async () => {
      tokens.query.mockResolvedValue([
        {
          userId: 'jefe-1',
          chatId: '555',
          redirectPath: '/admin/services/abc',
        },
      ]);

      const result = await service.consume('pase-en-claro', '555');

      expect(result.user.id).toBe('jefe-1');
      expect(result.redirectPath).toBe('/admin/services/abc');
      // El marcado como usado va en el propio UPDATE, no en una lectura previa.
      expect(tokens.query.mock.calls[0][0]).toContain('SET used_at = now()');
      expect(tokens.query.mock.calls[0][0]).toContain('used_at IS NULL');
      expect(tokens.query.mock.calls[0][0]).toContain('expires_at > now()');
    });

    it('rechaza un pase ya usado o caducado', async () => {
      tokens.query.mockResolvedValue([]);

      await expect(service.consume('pase', '555')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza el pase abierto desde un chat distinto al que lo pidio', async () => {
      tokens.query.mockResolvedValue([
        { userId: 'jefe-1', chatId: '555', redirectPath: null },
      ]);

      await expect(service.consume('pase', '999')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza el pase de una cuenta desactivada despues de emitirlo', async () => {
      tokens.query.mockResolvedValue([
        { userId: 'jefe-1', chatId: null, redirectPath: null },
      ]);
      usuarios.findOne.mockResolvedValue({ id: 'jefe-1', activo: false });

      await expect(service.consume('pase')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza un pase vacio sin tocar la base', async () => {
      await expect(service.consume('')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(tokens.query).not.toHaveBeenCalled();
    });
  });
});
