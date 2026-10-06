'use client';
import {useEffect,useRef,type ReactNode,type KeyboardEventHandler} from 'react';
import {X,LoaderCircle,ArrowRight,House} from 'lucide-react';
export function Brand({href='/bj'}:{href?:string}){return <a href={href} className="brand" aria-label="Haven home"><span className="brand-icon"><House size={21} strokeWidth={2.5}/></span>haven<span className="brand-dot">.</span></a>;}
export function Spinner(){return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/> Loading…</div>;}
export function Empty({title='Nothing here yet',description='Your records will appear here.',children}:{title?:string;description?:string;children?:ReactNode}){return <div className="empty"><House size={32}/><h3>{title}</h3><p>{description}</p>{children}</div>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div role="alert" className="error-box">{message}{retry&&<button onClick={retry}>Try again <ArrowRight size={15}/></button>}</div>;}
export function Dialog({title,children,onClose,className,closeIcon,onKeyDown}:{title:string;children:ReactNode;onClose:()=>void;className?:string;closeIcon?:ReactNode;onKeyDown?:KeyboardEventHandler<HTMLDialogElement>}){const ref=useRef<HTMLDialogElement>(null);const closeRef=useRef(onClose);closeRef.current=onClose;useEffect(()=>{const previous=document.activeElement as HTMLElement;const dialog=ref.current;dialog?.showModal();const priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();closeRef.current();}};dialog?.addEventListener('keydown',key);return()=>{dialog?.removeEventListener('keydown',key);dialog?.close();document.body.style.overflow=priorOverflow;previous?.focus({preventScroll:true});};},[]);return <dialog ref={ref} onKeyDown={onKeyDown} className={className?'dialog '+className:'dialog'} aria-label={title} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog">{closeIcon||<X size={21}/>}</button></div>{children}</dialog>;}
export function Badge({children}:{children:ReactNode}){return <span className="badge">{children}</span>;}

export {MediaStudio,MediaReviewQueue} from './media-studio';

export {DraftListingWorkbench} from './draft-workbench';

export {ViewingCalendar} from './viewing-calendar';

export {CsvExport} from './csv-export';
export {ConversationContext} from './conversation-context';
export {ChatComposer,ChatMessage} from './chat-composer';

export {ConversationInbox} from './conversation-inbox';
export {QuoteWorkspace} from './quote-workspace';
export {ManagementGrants} from './management-grants';
export {TenantLinks} from './tenant-links';
export {LeaseDraftForm} from './lease-draft-form';
export {LeaseActivationForm} from './lease-activation-form';
export {LeaseLifecycleForm} from './lease-lifecycle-form';
export {RecurringChargeForm} from './recurring-charge-form';
export {PaymentEvidenceForm} from './payment-evidence-form';
export {PaymentAllocationForm} from './payment-allocation-form';
export {FinancialReversalForm} from './financial-reversal-form';

export {DepositLedgerForm} from './deposit-ledger-form';

export {MaintenanceRequests} from './maintenance-requests';

export {LeaseStatement} from './lease-statement';

export {SupportCases} from './support-cases';
