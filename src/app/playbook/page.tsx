import PlaybookClient from "./PlaybookClient";

export default function PlaybookPage() {
  return (
    <div
      className="-mx-4 -mt-6 -mb-6 sm:-mx-6 sm:-mt-8 sm:-mb-8 flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 3.75rem)" }}
    >
      <PlaybookClient />
    </div>
  );
}
