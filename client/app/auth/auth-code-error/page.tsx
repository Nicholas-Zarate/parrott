import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          Login failed
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Could not complete Discord login. The authorization code may have
          expired or been used already.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
