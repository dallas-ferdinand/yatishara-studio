export function WamPayMark() {
  return (
    <img
      src="/branding/wam-logo.png"
      alt=""
      className="studio-wam-pay-mark"
      width={131}
      height={40}
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function WamPayLabel({ amountShort }: { amountShort?: string | null }) {
  return (
    <>
      {amountShort ? `Pay ${amountShort} with` : "Pay with"}
      <WamPayMark />
    </>
  );
}
