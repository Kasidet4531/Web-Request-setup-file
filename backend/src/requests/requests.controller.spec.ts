import { Test, TestingModule } from '@nestjs/testing';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

describe('RequestsController draft flow', () => {
  let controller: RequestsController;
  let service: {
    createDraft: jest.Mock;
    getRequest: jest.Mock;
    queryRequests: jest.Mock;
    submitRequest: jest.Mock;
    updateDraftRequesterData: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createDraft: jest.fn(),
      getRequest: jest.fn(),
      queryRequests: jest.fn(),
      submitRequest: jest.fn(),
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

  it('queries request list filters and pagination', async () => {
    service.queryRequests.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    await expect(
      controller.queryRequests({ keyword: 'probe', status: 'Submitted' }),
    ).resolves.toEqual({ items: [], total: 0, limit: 50, offset: 0 });

    expect(service.queryRequests).toHaveBeenCalledWith({
      keyword: 'probe',
      status: 'Submitted',
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

  it('submits a draft request by id', async () => {
    service.submitRequest.mockResolvedValue({
      id: 'request-1',
      status: 'Submitted',
    });

    await expect(
      controller.submitRequest('request-1', { formVersion: 4 }),
    ).resolves.toEqual({
      id: 'request-1',
      status: 'Submitted',
    });

    expect(service.submitRequest).toHaveBeenCalledWith('request-1', {
      formVersion: 4,
    });
  });
});
