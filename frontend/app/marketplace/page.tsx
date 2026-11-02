import {notFound} from 'next/navigation';
import Demo from './demo';
export default function MarketplacePage(){
  if(process.env.NODE_ENV==='production')notFound();
  return <Demo/>;
}
