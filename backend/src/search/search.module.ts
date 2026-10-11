import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** Global search for the command palette. */
@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
