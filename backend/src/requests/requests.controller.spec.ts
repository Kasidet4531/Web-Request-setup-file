import { Test, TestingModule } from '@nestjs/testing';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

describe('RequestsController draft flow', () => {
  let controller: RequestsController;
  let service: {
    createDraft: jest.Mock;
    getRequest: jest.Mock;
    updateDraftRequesterData: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createDraft: jest.fn(),
      getRequest: jest.fn(),
      updateDraftRequesterData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RequestsController],
      providers: [{ provide: RequestsService, useValue: service }],
    }).compile();

    controller = module.get(RequestsController);
  });

  it('creates a draft request from requester data', async () => {
    service.createDraft.mockResolvedValue({ id: 'request-1', status: 'Draft' });

    await expect(
      controller.createDraft({
        requester: 'Fook',
        requesterData: { product_type: 'New Product' },
      }),
    ).resolves.toEqual({ id: 'request-1', status: 'Draft' });

    expect(service.createDraft).toHaveBeenCalledWith({
      requester: 'Fook',
      requesterData: { product_type: 'New Product' },
    });
  });

  it('loads a request detail by id', async () => {
    service.getRequest.mockResolvedValue({ id: 'request-1', status: 'Draft' });

    await expect(controller.getRequest('request-1')).resolves.toEqual({
      id: 'request-1',
      status: 'Draft',
    });
  });

  it('updates requester-owned data for a draft request', async () => {
    service.updateDraftRequesterData.mockResolvedValue({
      id: 'request-1',
      status: 'Draft',
    });

    await expect(
      controller.updateDraftRequesterData('request-1', {
        requester: 'Fook',
        requesterData: { product_type: 'Transfer Product' },
      }),
    ).resolves.toEqual({ id: 'request-1', status: 'Draft' });

    expect(service.updateDraftRequesterData).toHaveBeenCalledWith('request-1', {
      requester: 'Fook',
      requesterData: { product_type: 'Transfer Product' },
    });
  });
});
