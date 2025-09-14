// bot/mini-app/src/pages/InitDataPage.tsx
import { type FC } from 'react';
import { initDataRaw, useInitData } from '@telegram-apps/sdk-react';
import { DisplayData } from '@/components/common/DisplayData/DisplayData';

export const InitDataPage: FC = () => {
  const initData = useInitData();

  const rows = [
    { title: 'Raw', value: initDataRaw() || 'Not available' },
    { title: 'Auth date', value: initData?.authDate?.toLocaleString() || 'Not available' },
    { title: 'Hash', value: initData?.hash || 'Not available' },
    { title: 'Can send after', value: initData?.canSendAfter?.toLocaleString() || 'Not available' },
    { title: 'Query ID', value: initData?.queryId || 'Not available' },
    { title: 'Start param', value: initData?.startParam || 'Not available' },
  ];

  if (initData?.chat) {
    const { chat } = initData;
    rows.push(
      { title: 'Chat ID', value: chat.id.toString() },
      { title: 'Chat type', value: chat.type },
      { title: 'Chat title', value: chat.title || 'Not available' },
      { title: 'Chat username', value: chat.username || 'Not available' },
      { title: 'Chat photo URL', value: chat.photoUrl || 'Not available' }
    );
  }

  if (initData?.user) {
    const { user } = initData;
    rows.push(
      { title: 'User ID', value: user.id.toString() },
      { title: 'Is bot', value: user.isBot },
      { title: 'Is premium', value: user.isPremium },
      { title: 'First name', value: user.firstName },
      { title: 'Last name', value: user.lastName || 'Not available' },
      { title: 'Username', value: user.username || 'Not available' },
      { title: 'Language code', value: user.languageCode || 'Not available' },
      { title: 'Allows write to PM', value: user.allowsWriteToPm }
    );
  }

  if (initData?.receiver) {
    const { receiver } = initData;
    rows.push(
      { title: 'Receiver ID', value: receiver.id.toString() },
      { title: 'Receiver is bot', value: receiver.isBot },
      { title: 'Receiver is premium', value: receiver.isPremium },
      { title: 'Receiver first name', value: receiver.firstName },
      { title: 'Receiver last name', value: receiver.lastName || 'Not available' },
      { title: 'Receiver username', value: receiver.username || 'Not available' },
      { title: 'Receiver language code', value: receiver.languageCode || 'Not available' }
    );
  }

  return <DisplayData rows={rows} />;
};