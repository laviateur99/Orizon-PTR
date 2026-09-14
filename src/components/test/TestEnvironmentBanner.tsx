export function TestEnvironmentBanner(){
  if(process.env.NEXT_PUBLIC_APP_ENV!=="test")return null;
  return <div className="test-environment-banner" role="status">ENVIRONNEMENT DE TEST · DONNÉES SÉPARÉES DE LA PRODUCTION</div>;
}
