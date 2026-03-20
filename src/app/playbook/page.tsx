export default function PlaybookPage() {
  return (
    <div className="-mx-4 -mt-6 -mb-6 sm:-mx-6 sm:-mt-8 sm:-mb-8">
      <iframe
        src="/api/playbook/page"
        className="block border-0 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)]"
        style={{ height: "calc(100dvh - 3.75rem)" }}
        title="Sales Playbook"
      />
    </div>
  );
}
