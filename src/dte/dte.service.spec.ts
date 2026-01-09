import { Test, TestingModule } from '@nestjs/testing';
import { DteService } from './dte.service';

describe('DteService', () => {
  let service: DteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DteService],
    }).compile();

    service = module.get<DteService>(DteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
