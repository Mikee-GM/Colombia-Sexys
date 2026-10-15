/** @jest-environment jsdom */

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationMessage } from "@/lib/types";
import ConversationAttachment from "./ConversationAttachment";
import ConversationMessages from "./ConversationMessages";

const messageId = "00000000-0000-4000-8000-000000000001";
const photoPath = `/api/telegram-conversations/messages/${messageId}/photo`;

afterEach(cleanup);

it("muestra la foto por la ruta autenticada sin optimizador y conserva el texto", () => {
  const message: ConversationMessage = {
    id: messageId,
    clienteId: "client-1",
    servicioId: null,
    emisor: "cliente",
    mensaje: "Descripción original\nSegunda línea",
    enviadoAt: "2026-10-14T12:00:00.000Z",
    attachment: { type: "photo", url: photoPath },
  };
  const { container } = render(
    <ConversationMessages messages={[message]} endRef={createRef<HTMLDivElement>()} />,
  );
  const photo = screen.getByRole("img", { name: "Foto adjunta al mensaje" });
  expect((photo as HTMLImageElement).src).toBe(`${window.location.origin}${photoPath}`);
  expect(photo.getAttribute("srcset")).toBeNull();
  expect(photo.getAttribute("loading")).toBe("lazy");
  expect(photo.classList.contains("object-contain")).toBe(true);
  expect(container.querySelector("p.whitespace-pre-wrap")?.textContent).toBe(message.mensaje);
  const link = screen.getByRole("link", { name: "Abrir foto en otra pestaña" });
  expect(link.getAttribute("href")).toBe(photoPath);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.classList.contains("min-h-11")).toBe(true);
});

it("informa el fallo de la foto y permite reintentar sin afectar al mensaje", () => {
  render(
    <ConversationAttachment messageId={messageId} attachment={{ type: "photo", url: photoPath }} />,
  );
  const originalImage = screen.getByRole("img");
  fireEvent.error(originalImage);
  expect(screen.getByRole("status").textContent).toBe("No se pudo cargar la foto.");
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar foto" }));
  const retriedImage = screen.getByRole("img");
  expect(retriedImage).not.toBe(originalImage);
  expect((retriedImage as HTMLImageElement).src).toBe(`${window.location.origin}${photoPath}`);
  expect(screen.queryByRole("status")).toBeNull();
});

it.each([
  "https://example.test/photo.jpg",
  "//example.test/photo.jpg",
  "data:image/png;base64,unsafe",
  "javascript:alert(1)",
  `${photoPath}?url=https://example.test`,
  "/api/telegram-conversations/messages/another-message/photo",
])("no carga ni enlaza una foto fuera del endpoint del mensaje: %s", (url) => {
  render(
    <ConversationAttachment messageId={messageId} attachment={{ type: "photo", url }} />,
  );
  expect(screen.getByText("Foto no disponible.")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});

it("muestra coordenadas cero y solo enlaza el mapa, sin cargar mapas externos", () => {
  const { container } = render(
    <ConversationAttachment
      messageId={messageId}
      attachment={{
        type: "location",
        latitude: 0,
        longitude: 0,
        title: "Punto de referencia",
        address: "Dirección <script>inofensiva</script>",
      }}
    />,
  );
  expect(screen.getByText("0.000000, 0.000000")).toBeTruthy();
  expect(screen.getByText("Punto de referencia")).toBeTruthy();
  expect(screen.getByText("Dirección <script>inofensiva</script>")).toBeTruthy();
  const link = screen.getByRole("link", { name: "Abrir ubicación en Google Maps en otra pestaña" });
  expect(link.getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=0%2C0");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(container.querySelector("img, iframe, script")).toBeNull();
});

it.each([
  [91, 0],
  [-91, 0],
  [0, 181],
  [0, -181],
  [Number.NaN, 0],
  [0, Number.POSITIVE_INFINITY],
])("no enlaza coordenadas inválidas: %s, %s", (latitude, longitude) => {
  render(
    <ConversationAttachment
      messageId={messageId}
      attachment={{ type: "location", latitude, longitude }}
    />,
  );
  expect(screen.getByText("Ubicación no disponible.")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
});

it("no altera los mensajes históricos sin adjunto", () => {
  const { container } = render(<ConversationAttachment messageId={messageId} />);
  expect(container.childElementCount).toBe(0);
});
