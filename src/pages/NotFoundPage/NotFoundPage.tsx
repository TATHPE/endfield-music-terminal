import { Link } from "react-router-dom";
import { ACTIONS, PAGES } from "@/lib/strings";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h1 className="text-6xl font-bold mb-4">404</h1>
      <p className="text-lg text-muted-foreground mb-8">{PAGES.NOT_FOUND}</p>
      <Link to="/" className="text-primary hover:underline">{ACTIONS.BACK_HOME}</Link>
    </div>
  );
}
