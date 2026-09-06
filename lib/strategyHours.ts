/** Live skew checker stops when the exchange is closed. Mock punches may continue. */
export function shouldAbortStraddleForClosedMarket(isMock: boolean, marketOpen: boolean) {
  return !isMock && !marketOpen
}
