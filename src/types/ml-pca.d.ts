declare module 'ml-pca' {
  export interface PCAOptions {
    isCovarianceMatrix?: boolean
    method?: 'SVD' | 'NIPALS' | 'covarianceMatrix'
    center?: boolean
    scale?: boolean
    nCompNIPALS?: number
    ignoreZeroVariance?: boolean
  }
  export class PCA {
    constructor(dataset: number[][], options?: PCAOptions)
    predict(dataset: number[][], options?: { nComponents?: number }): { to2DArray(): number[][] }
  }
}
