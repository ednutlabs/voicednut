// bot/mini-app/src/pages/ThemeParamsPage.tsx
import { type FC } from 'react';
import { useThemeParams } from '@telegram-apps/sdk-react';
import { DisplayData } from '@/components/common/DisplayData/DisplayData';

export const ThemeParamsPage: FC = () => {
  const themeParams = useThemeParams();

  const rows = Object.entries(themeParams).map(([key, value]) => ({
    title: key,
    value: value || 'Not available'
  }));

  return <DisplayData rows={rows} />;
};