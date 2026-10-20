import type {ButtonHTMLAttributes} from 'react';

export function Button({variant='ghost',size='sm',className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'ghost'|'outline';size?:'sm'|'icon'}) {
  return <button type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} {...props}/>;
}
