import dynamic from "next/dynamic";

const StyleBot = dynamic(() => import("../components/StyleBot"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#555" }}>
      Загрузка…
    </div>
  ),
});

export default function Home() {
  return <StyleBot />;
}
