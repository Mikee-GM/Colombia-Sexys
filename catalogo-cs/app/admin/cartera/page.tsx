import { redirect } from "next/navigation";

/**
 * La cartera se absorbio en el panel de dinero.
 *
 * Aqui vivian las deudas y el efectivo sin entregar, cada uno en su tabla y sin
 * relacion con lo que se le paga a la persona en el corte. Ahora las tres cosas
 * son la misma ficha, asi que esta ruta solo existe para no romper los enlaces
 * que ya estaban repartidos por el panel y en marcadores del navegador.
 */
export default function CarteraPage() {
  redirect("/admin/dinero");
}
