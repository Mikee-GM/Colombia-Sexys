"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Un boton que dice cuando esta esperando respuesta.
 *
 * Lo que se ve --el indicador que gira, la opacidad que no baja y el cursor de
 * espera-- lo pone una regla de `globals.css` sobre `aria-busy`, para que valga
 * igual en los botones del panel que ya existian. Este componente es para el
 * codigo nuevo: evita tener que acordarse de poner `aria-busy` y de desactivar
 * el boton, y ademas cambia la etiqueta por lo que se esta haciendo.
 *
 * Sin `textoPendiente` se mantiene la etiqueta normal, que ya sirve porque el
 * indicador aparece igual; decir "Guardando" es mas claro, pero no siempre cabe.
 */
export default function BotonDeAccion({
  pendiente = false,
  textoPendiente,
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Si hay una peticion en curso. */
  pendiente?: boolean;
  /** Que se esta haciendo, en gerundio: "Guardando", "Enviando". */
  textoPendiente?: ReactNode;
}) {
  return (
    <button {...resto} disabled={disabled || pendiente} aria-busy={pendiente}>
      {pendiente && textoPendiente ? textoPendiente : children}
    </button>
  );
}
