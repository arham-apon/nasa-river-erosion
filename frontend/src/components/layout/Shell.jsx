import { Suspense } from "react";
import { Outlet } from "react-router";
import Header from "./Header.jsx";
import DemoBar from "../../features/demo/DemoBar.jsx";
import { DemoProvider } from "../../features/demo/DemoContext.jsx";
import { Loading } from "../ui/StateView.jsx";
import s from "./layout.module.css";

export default function Shell() {
  return (
    <DemoProvider>
      <div className={s.shell}>
        <Header />
        <main className={s.main} id="main">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
        <DemoBar />
      </div>
    </DemoProvider>
  );
}
