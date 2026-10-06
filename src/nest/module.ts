/* eslint-disable @typescript-eslint/no-extraneous-class -- Nest modules are decorated classes */
import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { runSeeders, type RunOptions, type RunResult } from '../runner';
import type { Seeder, SeederClass } from '../seeder';

export const SEEDBED_OPTIONS = Symbol('SEEDBED_OPTIONS');

/** The core options, minus what the module controls itself. */
export type SeedbedRunOptions = Omit<RunOptions, 'client' | 'resolve' | 'seeder'>;

export interface SeedbedModuleOptions extends SeedbedRunOptions {
  /** Modules whose providers your seeders inject (repositories, services...). */
  imports?: NonNullable<ModuleMetadata['imports']>;
}

@Injectable()
export class SeedbedService {
  constructor(
    @Inject(SEEDBED_OPTIONS) private readonly options: SeedbedRunOptions,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  /** Runs the default seeder, or the one with the given class name. Seeders get dependency injection. */
  run(seeder?: string): Promise<RunResult> {
    return runSeeders({
      ...this.options,
      ...(seeder ? { seeder } : {}),
      resolve: (cls: SeederClass) => this.moduleRef.get(cls as Type<Seeder>, { strict: false }),
    });
  }
}

@Module({})
export class SeedbedModule {
  static forRoot({ imports = [], ...options }: SeedbedModuleOptions): DynamicModule {
    return {
      module: SeedbedModule,
      imports,
      providers: [
        { provide: SEEDBED_OPTIONS, useValue: options },
        SeedbedService,
        ...(options.seeders as unknown as Type<unknown>[]),
      ],
      exports: [SeedbedService],
    };
  }
}
