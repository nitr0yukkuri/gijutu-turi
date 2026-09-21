import { createRoot } from "react-dom/client";
import "../../ocean.css";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("React root was not found");

createRoot(root).render(<App />);
