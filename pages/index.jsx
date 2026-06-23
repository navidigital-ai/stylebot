import dynamic from "next/dynamic";

const StyleBot = dynamic(
  () =>
    Promise.race([
      import("../components/StyleBot"),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout: компонент не загрузился за 15 сек")),
          15000
        )
      ),
    ]).catch((err) => ({
      default: function ErrPage() {
        return (
          <div style={{ padding: 24, fontFamily: "sans-serif" }}>
            <h2 style={{ color: "red" }}>Ошибка загрузки</h2>
            <pre style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 12 }}>
              {err?.message || String(err)}
            </pre>
          </div>
        );
      },
    })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "sans-serif",
          color: "#555",
        }}
      >
        <div>Загрузка…</div>
        <div style={{ fontSize: 12, marginTop: 8, color: "#aaa" }}>
          загружаем компонент…
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return <StyleBot />;
}
