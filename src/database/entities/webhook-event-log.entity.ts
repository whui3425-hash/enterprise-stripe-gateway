import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('webhook_event_logs')
export class WebhookEventLog {
  @PrimaryColumn({ type: 'varchar', length: 255, name: 'event_id' })
  eventId: string;

  @Column({ type: 'varchar', length: 255, name: 'event_type' })
  eventType: string;

  @Column({ type: 'varchar', length: 64, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'processed_at' })
  processedAt: Date | null;
}
