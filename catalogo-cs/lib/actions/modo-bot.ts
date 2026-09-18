'use server';

import { apiFetch } from '@/lib/api-server';
import { revalidatePath } from 'next/cache';

/**
 * Activa o desactiva el modoBot de una empleada o chofer.
 *
 * modoBot = true  ? usa el app de Telegram normalmente
 * modoBot = false ? el sistema avanza automaticamente (modo simulacion)
 */
export async function toggleModoBot(
  id: string,
  tipo: 'empleada' | 'chofer',
  modoBot: boolean,
): Promise<void> {
  const endpoint = tipo === 'empleada' ? /employees/ : /drivers/;
  await apiFetch(endpoint, {
    method: 'PATCH',
    authenticated: true,
    body: JSON.stringify({ modoBot }),
  });

  // Revalidar las páginas del panel admin
  if (tipo === 'empleada') {
    revalidatePath(/admin/employees/);
    revalidatePath('/admin/employees');
  } else {
    revalidatePath(/admin/drivers/);
    revalidatePath('/admin/drivers');
    revalidatePath('/admin/choferes');
  }
}
