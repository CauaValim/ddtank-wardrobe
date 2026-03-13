import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Gamepad2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Gamepad2 className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-4 text-sm text-muted-foreground">Página não encontrada</p>
        <a href="/" className="text-sm text-primary underline hover:text-primary/90">
          Voltar ao Painel
        </a>
      </div>
    </div>
  );
};

export default NotFound;
