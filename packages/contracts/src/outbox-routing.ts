/** The platform consumer must never acknowledge an inventory engine event.
 * Unknown engine event versions stay with that consumer for explicit handling.
 */
export function outboxConsumer(kind:string):'platform'|'digitization'{
 return kind.startsWith('digitization.')?'digitization':'platform';
}
export const digitizationOutboxConsumer='digitization' as const;
export const digitizationQueueName='digitization' as const;
