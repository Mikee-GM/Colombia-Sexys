import {
  getOperationalDateRange,
  getOperationalWeekPeriod,
  shiftOperationalWeek,
} from "./week-range";

describe("semana operativa en America/Mexico_City", () => {
  it.each([
    ["2026-10-12T05:59:59.999Z", "2026-10-05", "2026-10-11", "2026-W41"],
    ["2026-10-12T06:00:00.000Z", "2026-10-12", "2026-10-18", "2026-W42"],
    ["2027-01-01T18:00:00.000Z", "2026-12-28", "2027-01-03", "2026-W53"],
    ["2027-01-04T05:59:59.999Z", "2026-12-28", "2027-01-03", "2026-W53"],
    ["2027-01-04T06:00:00.000Z", "2027-01-04", "2027-01-10", "2027-W1"],
  ])("ubica %s en el calendario del negocio", (instant, startDate, endDate, weekLabel) => {
    expect(getOperationalWeekPeriod(new Date(instant))).toMatchObject({
      startDate,
      endDate,
      weekLabel,
    });
  });

  it("incluye todo el domingo y excluye el lunes siguiente", () => {
    const { start, end } = getOperationalWeekPeriod(new Date("2026-10-14T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-12T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-19T05:59:59.999Z");
    expect(new Date(end.getTime() + 1).toISOString()).toBe("2026-10-19T06:00:00.000Z");
  });

  it("obtiene el mismo periodo para el mismo instante UTC, Los Angeles y Mexico", () => {
    const instants = [
      "2026-10-12T05:59:59Z",
      "2026-10-11T22:59:59-07:00",
      "2026-10-11T23:59:59-06:00",
    ];
    const periods = instants.map((instant) => getOperationalWeekPeriod(new Date(instant)));
    expect(periods[1]).toEqual(periods[0]);
    expect(periods[2]).toEqual(periods[0]);
  });

  it("navega por calendario al cruzar el cambio de horario del dispositivo y el anio", () => {
    const reference = new Date("2026-11-01T06:30:00Z");
    const next = shiftOperationalWeek(reference, 1);
    expect(next.toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(shiftOperationalWeek(next, -1).toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(shiftOperationalWeek(new Date("2026-12-31T18:00:00Z"), 1).toISOString())
      .toBe("2027-01-04T06:00:00.000Z");
  });

  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026-10-12T00:00:00Z", "2026-10-18"],
    ["2026-10-19", "2026-10-18"],
  ])("rechaza el periodo invalido %s a %s", (startDate, endDate) => {
    expect(() => getOperationalDateRange(startDate, endDate)).toThrow(RangeError);
  });
});
