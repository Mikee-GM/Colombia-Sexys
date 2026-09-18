'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-server';

export async function toggleModoBot(id: string, tipo: 'empleada' | 'chofer', modoBot: boolean) {
  try {
    const endpoint =
      tipo === 'empleada' ? `/employees/${id}` : `/drivers/${id}`;

    await apiFetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ modoBot }),
    });

    // Revalidar para que se actualice la data en el panel
    if (tipo === 'empleada') {
      revalidatePath(`/admin/employees/${id}`);
      revalidatePath('/admin/employees');
    } else {
      revalidatePath(`/admin/drivers/${id}`);
      revalidatePath('/admin/drivers');
    }
  } catch (error) {
    console.error('Error toggling modoBot:', error);
    throw error;
  }
}
