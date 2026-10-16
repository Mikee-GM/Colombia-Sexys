/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReceiptVerification from "./receipt-verification";
import {
  confirmReceiptCep,
  getReceiptBankAccounts,
} from "@/lib/actions/evidence";

jest.mock("@/lib/actions/evidence", () => ({
  getReceiptBankAccounts: jest.fn(),
  confirmReceiptCep: jest.fn(),
  applyConfirmedGroupReceipt: jest.fn(),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  jest.mocked(getReceiptBankAccounts).mockResolvedValue([
    {
      id: "account-1",
      banco: "Banco de prueba",
      titular: "Titular QA",
      clabe: "000000000000000000",
    },
  ]);
  jest.mocked(confirmReceiptCep).mockResolvedValue({
    id: "receipt-1",
    servicioId: "service-1",
    pagoConfirmadoAt: "2026-10-16T12:00:00.000Z",
    createdAt: "2026-10-16T11:00:00.000Z",
  });
});

it("muestra lo que falta en la foto y exige revisión humana del CEP", async () => {
  render(
    <ReceiptVerification
      receipt={{
        id: "receipt-1",
        serviceId: "service-1",
        status: "PENDIENTE_REVISION",
        amount: null,
        originBank: "Banco de prueba",
        trackingKey: null,
      }}
    />,
  );

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Revisar datos" }));
  });
  expect(screen.getAllByText("No visible en la foto").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /Consultar CEP en Banxico/ }).getAttribute("href"))
    .toBe("https://www.banxico.org.mx/cep/");
  const confirmButton = await screen.findByRole("button", {
    name: "Registrar confirmación manual del CEP",
  }) as HTMLButtonElement;
  expect(confirmButton.disabled).toBe(true);
  expect(confirmReceiptCep).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Clave de rastreo del CEP"), {
    target: { value: "QA123456" },
  });
  fireEvent.change(screen.getByLabelText("Fecha del CEP (AAAA-MM-DD)"), {
    target: { value: "2026-10-16" },
  });
  fireEvent.change(screen.getByLabelText("Monto acreditado según CEP"), {
    target: { value: "1200" },
  });
  await waitFor(() => expect(screen.getByRole("option", { name: /Titular QA/ })).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Cuenta beneficiaria comprobada"), {
    target: { value: "account-1" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => {
    fireEvent.click(confirmButton);
  });
  await waitFor(() =>
    expect(confirmReceiptCep).toHaveBeenCalledWith("receipt-1", {
      claveRastreo: "QA123456",
      fechaTransferencia: "2026-10-16",
      bancoOrigen: "Banco de prueba",
      cuentaDestinoId: "account-1",
      monto: 1200,
    }),
  );
});
