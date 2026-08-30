export function isMobileApp() {
  const capacitorWindow = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  };

  return Boolean(capacitorWindow.Capacitor?.isNativePlatform?.());
}
