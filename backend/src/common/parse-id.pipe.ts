import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Messages } from './messages';

/** Route ids must be UUIDs. A malformed id answers 404 (not 400), so probing ids reveals nothing. */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) throw new NotFoundException(Messages.NOT_FOUND);
    return value;
  }
}
