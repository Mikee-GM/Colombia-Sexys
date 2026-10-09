import { portalDeRol } from './notifications.controller';

describe('portalDeRol', () => {
  it.each([
    ['empleada', '/empleada/portal'],
    ['chofer', '/chofer/portal'],
    ['admin', '/admin/dashboard'],
    ['jefe', '/jefe'],
  ])('dirige el aviso de %s a su portal', (rol, portal) => {
    expect(portalDeRol(rol)).toBe(portal);
  });
});
