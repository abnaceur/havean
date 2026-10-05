'use client';
export default function Error({reset}:{reset:()=>void}){return <main className="not-found"><h1>We couldn’t load this page.</h1><p>Please try again in a moment.</p><button className="button" onClick={reset}>Try again</button></main>;}
