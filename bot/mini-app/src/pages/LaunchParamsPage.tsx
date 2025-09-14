// bot/mini-app/src/pages/LaunchParamsPage.tsx
import { type FC } from 'react';
import { useLaunchParams } from '@telegram-apps/sdk-react';
import { DisplayData } from '@/components/common/DisplayData/DisplayData';

export const LaunchParamsPage: FC = () => {
  const lp = useLaunchParams();

  const rows = [
    { title: 'Start param', value: lp.startParam || 'Not available' },
    { title: 'Platform', value: lp.platform },
    { title: 'Version', value: lp.version },
    { title: 'Bot inline', value: lp.botInline },
    { title: 'Show settings', value: lp.showSettings },
  ];

  if (lp.themeParams) {
    Object.entries(lp.themeParams).forEach(([key, value]) => {
      rows.push({ title: `Theme param: ${key}`, value });
    });
  }

  return <DisplayData rows={rows} />;
};