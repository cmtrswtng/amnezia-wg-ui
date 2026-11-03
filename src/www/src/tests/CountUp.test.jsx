import { StrictMode } from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { animate, useReducedMotion } from "motion/react";
import CountUp from "../components/react-bits/CountUp";

vi.mock("motion/react", () => ({
  animate: vi.fn(() => ({ stop: vi.fn() })),
  useReducedMotion: vi.fn(() => false),
}));

describe("CountUp", () => {
  it("restarts an interrupted entrance under development StrictMode", () => {
    animate.mockClear();
    const { container, rerender } = render(
      <StrictMode>
        <CountUp value={10} />
      </StrictMode>,
    );
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.results[0].value.stop).toHaveBeenCalledOnce();
    expect(animate.mock.results[1].value.stop).not.toHaveBeenCalled();
    const animation = animate.mock.calls[1][2];
    act(() => animation.onUpdate(4));
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "4",
    );
    expect(screen.getByText("10")).toHaveClass("sr-only");
    act(() => {
      animation.onUpdate(10);
      animation.onComplete();
    });
    rerender(
      <StrictMode>
        <CountUp value={12} />
      </StrictMode>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "12",
    );
    expect(animate).toHaveBeenCalledTimes(2);
  });
  it("shows the final value immediately with reduced motion", () => {
    animate.mockClear();
    useReducedMotion.mockReturnValueOnce(true);
    const { container } = render(<CountUp value={10} />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "10",
    );
    expect(animate).not.toHaveBeenCalled();
  });
});
