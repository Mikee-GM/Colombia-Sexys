/** @jest-environment jsdom */

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationMessage } from "@/lib/types";
import ConversationComposer from "./ConversationComposer";
import ConversationMessages from "./ConversationMessages";

afterEach(cleanup);

it("permite ajustar enlaces largos sin recortar el texto ni perder saltos de linea", () => {
  const text = `https://example.test/${"a".repeat(180)}\nSegunda linea`;
  const message: ConversationMessage = {
    id: "message-1",
    clienteId: "client-1",
    servicioId: null,
    emisor: "cliente",
    mensaje: text,
    enviadoAt: "2026-10-14T12:00:00.000Z",
  };
  const { container } = render(
    <ConversationMessages messages={[message]} endRef={createRef<HTMLDivElement>()} />,
  );
  const paragraph = container.querySelector("p");
  expect(paragraph?.textContent).toBe(text);
  expect(paragraph?.classList.contains("whitespace-pre-wrap")).toBe(true);
  expect(paragraph?.classList.contains("break-words")).toBe(true);
  expect(paragraph?.parentElement?.classList.contains("min-w-0")).toBe(true);
});

function composerProps() {
  return {
    value: "Mensaje de prueba",
    humanControl: true,
    sending: false,
    changingMode: false,
    onChange: jest.fn(),
    onSend: jest.fn(),
    onTakeover: jest.fn(),
  };
}

it("identifica el campo para lectores de pantalla y mantiene texto de 16px en movil", () => {
  render(<ConversationComposer {...composerProps()} />);
  const textbox = screen.getByRole("textbox", { name: "Mensaje" });
  expect(textbox.classList.contains("text-base")).toBe(true);
  expect(textbox.classList.contains("sm:text-sm")).toBe(true);
  expect(textbox.getAttribute("maxLength")).toBe("4000");
});

it("conserva escritura, envio y Shift+Enter sin modificar sus callbacks", () => {
  const props = composerProps();
  render(<ConversationComposer {...props} />);
  const textbox = screen.getByRole("textbox", { name: "Mensaje" });
  fireEvent.change(textbox, { target: { value: "Otro mensaje" } });
  expect(props.onChange).toHaveBeenCalledWith("Otro mensaje");
  fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });
  expect(props.onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(textbox, { key: "Enter" });
  expect(props.onSend).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  expect(props.onSend).toHaveBeenCalledTimes(2);
});

it("mantiene desactivado el envio mientras se esta enviando o el texto esta vacio", () => {
  const props = composerProps();
  const { rerender } = render(<ConversationComposer {...props} sending />);
  expect((screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  expect(props.onSend).not.toHaveBeenCalled();

  rerender(<ConversationComposer {...props} value=" " />);
  expect((screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  expect(props.onSend).not.toHaveBeenCalled();
});
