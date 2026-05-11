import { redirect } from 'next/navigation';

export default function TodayPage() {
  redirect('/results?view=daily');
}
