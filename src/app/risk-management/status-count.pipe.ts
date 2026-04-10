import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'statusCount', standalone: true })
export class StatusCountPipe implements PipeTransform {
  transform(risks: { status: string }[], status: string): number {
    return risks.filter(r => r.status === status).length;
  }
}
