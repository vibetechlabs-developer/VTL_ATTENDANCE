import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-6">
      <div className="text-center space-y-4 max-w-md">
        <p className="text-7xl font-bold gradient-text">404</p>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <Button asChild className="bg-gradient-primary shadow-md">
          <Link to="/"><Home className="h-4 w-4 mr-2" /> Back home</Link>
        </Button>
      </div>
    </div>
  );
}
