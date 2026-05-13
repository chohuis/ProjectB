---
url: >-
  https://developers-apps-in-toss.toss.im/bedrock/reference/framework/인앱
  결제/subscription.md
---

# IAP 정기결제

이 문서는 구독(정기결제) 상품을 다루기 위한 SDK 변경 사항과 사용 방법을 정리한 가이드예요.\
`getProductItemList`에서 구독 상품이 어떻게 내려오는지와 구독 주문을 생성하는 `createSubscriptionPurchaseOrder`의 사용법을 포함해요.

:::tip 현재 샌드박스 앱에서는 구독 기능 테스트를 지원하지 않아요.
추후 지원 예정이에요.
:::

연동 흐름은 아래 순서를 따라 주세요.

1. [구독 상품 목록 가져오기](#getproductitemlist) — `getProductItemList`
2. [구독 주문 생성하기](#createsubscriptionpurchaseorder) — `createSubscriptionPurchaseOrder`
3. [구독 상태 조회하기](#getsubscriptioninfo) — `getSubscriptionInfo`

***

## `IAP` 객체

기존 IAP 객체에 다음 기능이 추가/확장되었어요.

### 시그니처

```tsx
IAP {
  getProductItemList: typeof getProductItemList;
  createOneTimePurchaseOrder: typeof createOneTimePurchaseOrder;
  createSubscriptionPurchaseOrder: typeof createSubscriptionPurchaseOrder;
  getSubscriptionInfo: typeof getSubscriptionInfo;
  getPendingOrders: typeof getPendingOrders;
  getCompletedOrRefundedOrders: typeof getCompletedOrRefundedOrders;
  completeProductGrant: typeof completeProductGrant;
}
```

`createSubscriptionPurchaseOrder`는 구독 전용 주문 생성 함수로,\
기존 일회성 주문 흐름과 유사하지만 구독 전용 파라미터(offerId, renewalCycle 노출 등)를 처리합니다.\
반환되는 cleanup 함수는 기존과 동일하게 앱브릿지 리소스 해제용입니다.

## 상품 목록 조회하기(`getProductItemList`) {#getproductitemlist}

`getProductItemList()`는 이제 구독 상품(type: 'SUBSCRIPTION')을 포함한 상품 목록을 반환할 수 있어요.\
구독 상품은 추가 필드를 가져요.

### 시그니처

```tsx
function getProductItemList(): Promise<{ products: IapProductListItem[] } | undefined>;
```

### 반환값

### 프로퍼티

```tsx
/** 기본 반환 **/
interface IapProductListItemBase {
  type: 'CONSUMABLE' | 'NON_CONSUMABLE' | 'SUBSCRIPTION';
  sku: string;
  displayAmount: string;
  displayName: string;
  iconUrl: string;
  description: string;
  hint?: Record<string, string>;
}

/** 구독 전용 확장 반환 **/
interface IapSubscriptionProduct extends IapProductListItemBase {
  type: 'SUBSCRIPTION';
  renewalCycle: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  offers?: Offer[];
}

/** 구독 Offer 타입 */
type Offer = FreeTrial | NewSubscription | Returning;

// 1. 무료 체험
interface FreeTrial {
  type: 'FREE_TRIAL';
  offerId: string;
  period: string;
}

// 2. 신규 구독 사용자
interface NewSubscription {
  type: 'NEW_SUBSCRIPTION';
  offerId: string;
  period: string;
  displayAmount: string;
}

// 3. 복귀 사용자
interface Returning {
  type: 'RETURNING';
  offerId: string;
  period: string;
  displayAmount: string;
}
```

| 필드          | 타입   | 설명                             |
| ------------- | ------ | -------------------------------- |
| type          | string | 상품 유형이에요                  |
| sku           | string | 상품의 고유 ID예요               |
| displayAmount | string | 통화 단위가 포함된 가격 정보예요 |
| displayName   | string | 화면에 표시할 상품 이름이에요    |
| iconUrl       | string | 상품 아이콘 이미지 URL이에요     |
| description   | string | 상품 설명이에요                  |

### 상품 타입 구분

`getProductItemList`는 다음 세 가지 상품 타입을 반환할 수 있어요.

```tsx
type IapProductType = 'CONSUMABLE' | 'NON_CONSUMABLE' | 'SUBSCRIPTION';
```

각 타입의 의미는 다음과 같아요.

#### 1. 소모성 상품 (CONSUMABLE)

한 번 사용하면 소멸되는 상품이에요.\
예: 코인, 재화, 하트 등

```json
{
  type: 'CONSUMABLE';
  sku: string;
  displayAmount: string;
  displayName: string;
  iconUrl: string;
  description: string;
  hint?: Record<string, string>;
}
```

* 구매 후 여러 번 재구매할 수 있어요.
* 결제 성공 후 서버에서 상품을 지급하고 completeProductGrant를 호출해야 해요.
* 자동 갱신 개념은 없어요.

#### 2. 비소모성 상품 (NON\_CONSUMABLE)

한 번 구매하면 영구적으로 소유하는 상품이에요.\
예: 광고 제거, 영구 업그레이드

```json
{
  type: 'NON_CONSUMABLE';
  sku: string;
  displayAmount: string;
  displayName: string;
  iconUrl: string;
  description: string;
  hint?: Record<string, string>;
}
```

* 동일 계정에서는 재구매하지 않아요.
* 기기 변경 시 복원 로직이 필요할 수 있어요.
* 자동 갱신되지 않아요.

#### 3. 구독 상품 (SUBSCRIPTION)

일정 주기로 자동 갱신되는 상품이에요.\
예: 월간/연간 멤버십

```json
{
  type: 'SUBSCRIPTION';
  sku: string;
  displayAmount: string;
  displayName: string;
  iconUrl: string;
  description: string;
  hint?: Record<string, string>;
  renewalCycle: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  offers?: Offer[];
}
```

| 필드         | 타입    | 설명                                        |
| ------------ | ------- | ------------------------------------------- |
| renewalCycle | string  | 구독 갱신 주기예요                          |
| offers       | Offer\[] | 사용자가 받을 수 있는 구독 혜택 목록이에요. |

* 자동 갱신돼요.
* 무료 체험, 신규 할인, 복귀 할인 등의 offers를 가질 수 있어요.
* 주문은 createSubscriptionPurchaseOrder로 생성해야 해요.
* 서버에서 구독 상태 동기화(갱신/취소/환불 처리)가 필요해요.

#### 타입별 주문 생성 함수 정리

| 타입             | 주문 생성 함수                    |
| ---------------- | --------------------------------- |
| `CONSUMABLE`     | `createOneTimePurchaseOrder`      |
| `NON_CONSUMABLE` | `createOneTimePurchaseOrder`      |
| `SUBSCRIPTION`   | `createSubscriptionPurchaseOrder` |

***

## 구독 주문 생성하기(`createSubscriptionPurchaseOrder`) {#createsubscriptionpurchaseorder}

구독 상품 전용 주문을 생성하고, 구독 결제 페이지로 이동하는 함수예요.\
사용자가 구독 상품 구매 버튼을 누르는 상황에서 사용할 수 있어요.

### 시그니처

```tsx
function createSubscriptionPurchaseOrder(params: CreateSubscriptionPurchaseOrderOptions): () => void;
```

### 프로퍼티

```tsx
interface CreateSubscriptionPurchaseOrderOptions {
  options: {
    sku: string; // 필수: 구매할 구독 SKU
    offerId?: string | null; // 선택: 적용할 offer ID (없으면 기본 가격)
    processProductGrant: (params: { orderId: string; subscriptionId?: string }) => boolean | Promise<boolean>;
  };
  onEvent: (event: SubscriptionSuccessEvent) => void | Promise<void>;
  onError: (error: unknown) => void | Promise<void>;
}
```

### 사용 예시

```tsx
import { IAP } from '@apps-in-toss/web-framework';
import { useCallback } from 'react';

interface Props {
  sku: string;
  offerId?: string;
}

function SubscriptionPurchaseButton({ sku, offerId }: Props) {
  const handleClick = useCallback(async () => {
    const cleanup = IAP.createSubscriptionPurchaseOrder({
      options: {
        sku,
        offerId,
        processProductGrant: ({ orderId, subscriptionId }) => {
          // 상품 지급 로직 작성
          console.log(orderId, subscriptionId);
          return true; // 상품 지급 여부
        },
      },
      onEvent: (event) => {
        console.log(event);
        cleanup();
      },
      onError: (error) => {
        console.error(error);
        cleanup();
      },
    });
  }, [sku, offerId]);

  return <button onClick={handleClick}>구독하기</button>;
}
```

***

## 구독 상태 조회하기(`getSubscriptionInfo`) {#getsubscriptioninfo}

구독 주문의 현재 상태 정보를 가져오는 함수예요.

:::tip 최소 지원 버전

* 토스앱 최소 지원 버전은 안드로이드 `5.253.0`, iOS `5.250.0` 이상 이에요.\
  해당 버전 미만에서는 `undefined`를 반환할 수 있어요.

:::

### 시그니처

```tsx
function getSubscriptionInfo(params: {
  params: { orderId: string };
}): Promise<{ subscription: IapSubscriptionInfoResult } | undefined>;
```

### 파라미터

### 반환값

### 프로퍼티

```tsx
interface IapSubscriptionInfoResult {
  catalogId: number;
  status: 'ACTIVE' | 'EXPIRED' | 'IN_GRACE_PERIOD' | 'ON_HOLD' | 'PAUSED' | 'REVOKED';
  expiresAt: string | null;
  isAutoRenew: boolean;
  gracePeriodExpiresAt: string | null;
  isAccessible: boolean;
}
```

| 필드                 | 타입                                                                               | 설명                                                             |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| catalogId            | number                                                                             | 구독 상품의 식별자예요.                                          |
| status               | `'ACTIVE' \| 'EXPIRED' \| 'IN_GRACE_PERIOD' \| 'ON_HOLD' \| 'PAUSED' \| 'REVOKED'` | 구독 상태를 나타내는 값이에요.                                   |
| expiresAt            | string | null                                                                     | 구독 만료 예정 시각이에요. 만료 정보가 없으면 `null`이에요.      |
| isAutoRenew          | boolean                                                                            | 구독 자동 갱신 여부예요.                                         |
| gracePeriodExpiresAt | string | null                                                                     | 결제 유예 기간 만료 시각이에요. 유예 기간이 없으면 `null`이에요. |
| isAccessible         | boolean                                                                            | 현재 구독 상품을 이용할 수 있는지 여부예요.                      |

### 사용 예시

:::: code-group

```tsx [React]
import { IAP } from '@apps-in-toss/web-framework';

async function fetchSubscriptionInfo(orderId: string) {
  try {
    const response = await IAP.getSubscriptionInfo({ params: { orderId } });
    return response?.subscription;
  } catch (error) {
    console.error(error);
  }
}
```

```tsx [React Native]
import { IAP } from '@apps-in-toss/framework';

async function fetchSubscriptionInfo(orderId: string) {
  try {
    const response = await IAP.getSubscriptionInfo({ params: { orderId } });
    return response?.subscription;
  } catch (error) {
    console.error(error);
  }
}
```

::::
