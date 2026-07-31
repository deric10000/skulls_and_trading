import { describe, expect, it } from "vitest";
import {
  reconcileWeatherSelection,
  type WeatherSelection,
} from "./selection";

const selectionForStock = (ticker: string | null): WeatherSelection => ({
  sector: ticker === "ELF" ? "Consumer Staples" : "Information Technology",
  industry: ticker === "ELF" ? "Personal Care Products" : "Software",
  stock: ticker,
});

describe("Market Weather selection reconciliation", () => {
  it("preserves the locally selected stock when live data refreshes", () => {
    expect(
      reconcileWeatherSelection({
        current: selectionForStock("ELF"),
        baseTicker: "CRWV",
        previousBaseTicker: "CRWV",
        availableStocks: ["CRWV", "ELF"],
        selectionForStock,
      }),
    ).toEqual(selectionForStock("ELF"));
  });

  it("follows a genuine external Current Watch focus change", () => {
    expect(
      reconcileWeatherSelection({
        current: selectionForStock("ELF"),
        baseTicker: "NVDA",
        previousBaseTicker: "CRWV",
        availableStocks: ["CRWV", "ELF", "NVDA"],
        selectionForStock,
      }),
    ).toEqual(selectionForStock("NVDA"));
  });

  it("preserves a locally selected empty industry during a data refresh", () => {
    const current: WeatherSelection = {
      sector: "Energy",
      industry: "Oil, Gas & Consumable Fuels",
      stock: null,
    };
    expect(
      reconcileWeatherSelection({
        current,
        baseTicker: "CRWV",
        previousBaseTicker: "CRWV",
        availableStocks: ["CRWV"],
        selectionForStock,
      }),
    ).toBe(current);
  });

  it("returns to the base stock when the selected stock is removed", () => {
    expect(
      reconcileWeatherSelection({
        current: selectionForStock("ELF"),
        baseTicker: "CRWV",
        previousBaseTicker: "CRWV",
        availableStocks: ["CRWV"],
        selectionForStock,
      }),
    ).toEqual(selectionForStock("CRWV"));
  });
});
