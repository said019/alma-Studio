import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("el símbolo tiene nombre accesible", () => {
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "HIVE Pilates Studio" })).toBeInTheDocument();
  });
  it("usa el isotipo oficial de Drive y hereda el color del contexto", () => {
    render(<BrandLogo />);
    const logo=screen.getByRole("img");
    expect(logo.style.maskImage).toContain("1fN-bt5ZwhkSTCCFOkykU2s0LmF-RUDXT");
    expect(logo).toHaveClass("bg-current");
  });
  it("usa la composición horizontal oficial sin recrear sus letras", () => {
    render(<BrandLogo variant="lockup" size={40} />);
    expect(screen.getByRole("img").style.maskImage).toContain("1kMJHrBpI2XBsgPaOPPQA2WT4ow_s8ty-");
    expect(screen.getByRole("img")).toHaveStyle({height:"40px",width:"137px"});
  });
});
