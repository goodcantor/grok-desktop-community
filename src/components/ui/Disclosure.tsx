import * as Collapsible from '@radix-ui/react-collapsible';
import {ChevronDown} from 'lucide-react';
import type {ReactNode} from 'react';
import {Button} from './Button';

export function Disclosure({label,children,className='',defaultOpen=false}: {label:ReactNode;children:ReactNode;className?:string;defaultOpen?:boolean}) {
  return <Collapsible.Root className={`ui-disclosure ${className}`} defaultOpen={defaultOpen}>
    <Collapsible.Trigger asChild><Button className="ui-disclosure-trigger">{label}<ChevronDown size={14} aria-hidden/></Button></Collapsible.Trigger>
    <Collapsible.Content className="ui-disclosure-content">{children}</Collapsible.Content>
  </Collapsible.Root>;
}
